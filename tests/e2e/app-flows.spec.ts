import { test, expect } from "@playwright/test";
import bcrypt from "bcryptjs";
import postgres from "postgres";

const PASSWORD="e2e-password-1234";

async function createVerifiedUser(testInfo:{project:{name:string};workerIndex:number},suffix:string,planSlug="free"){
  const url=process.env.DATABASE_URL;
  if(!url)throw new Error("DATABASE_URL is required for authenticated e2e tests");
  const safeProject=testInfo.project.name.replace(/[^a-z0-9]+/gi,"-").toLowerCase();
  const email=`e2e-${safeProject}-${testInfo.workerIndex}-${suffix}@example.test`;
  const sql=postgres(url,{max:1,prepare:false});
  try{
    const hash=await bcrypt.hash(PASSWORD,4);
    await sql.begin(async(tx)=>{
      await tx.unsafe("DELETE FROM users WHERE email=$1",[email]);
      const plans=await tx.unsafe("SELECT id FROM plans WHERE slug=$1 LIMIT 1",[planSlug]);
      if(!plans[0])throw new Error("PLAN_MISSING");
      const users=await tx.unsafe(
        "INSERT INTO users (email,password_hash,email_verified_at,country,base_currency,timezone) VALUES ($1,$2,now(),'GB','GBP','Europe/London') RETURNING id",
        [email,hash]
      );
      await tx.unsafe(
        "INSERT INTO subscriptions (user_id,plan_id,status,cadence) VALUES ($1,$2,$3,$4)",
        [users[0].id,plans[0].id,planSlug==="free"?"FREE":"ACTIVE",planSlug==="free"?"FREE":"MONTHLY"]
      );
    });
  }finally{
    await sql.end();
  }
  return {email,password:PASSWORD};
}

async function login(page:any,user:{email:string;password:string}){
  await page.goto("/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button",{name:"Sign in"}).click();
  await page.waitForURL("**/app");
}

test("new user can start a strategy through the three-step simple flow",async({page},testInfo)=>{
  const user=await createVerifiedUser(testInfo,"start");
  await page.addInitScript(()=>window.localStorage.setItem("strategyos-theme","dark"));
  await login(page,user);

  await expect(page.getByRole("heading",{name:"Start with one simple decision."})).toBeVisible();
  await expect(page.getByText("No trading is performed automatically.")).toBeVisible();

  await page.getByRole("link",{name:"Start my first strategy"}).click();
  await expect(page.getByRole("heading",{name:"Choose your strategy."})).toBeVisible();
  await page.getByRole("button",{name:/Continue/}).click();
  await expect(page.getByRole("heading",{name:"Where are you starting?"})).toBeVisible();
  await page.getByRole("button",{name:/Continue/}).click();
  await expect(page.getByRole("heading",{name:"Just the essentials."})).toBeVisible();

  await page.getByLabel("What should we call it?").fill("My 9Sig");
  await page.getByLabel("How much are you starting with?").fill("5000");
  await page.getByRole("button",{name:/Start my strategy/}).click();

  await page.waitForURL(/\/app\/strategies\//);
  await expect(page.getByRole("heading",{name:"My 9Sig"})).toBeVisible();

  await page.goto("/app/strategies/new");
  await expect(page.getByText(/using all 1 of your active strategy/i)).toBeVisible();
  await expect(page.getByRole("link",{name:/See plan options/})).toBeVisible();

  await page.goto("/app");
  await expect(page.locator("html")).toHaveAttribute("data-theme","dark");
  await page.getByRole("button",{name:"Toggle light or dark theme"}).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme","light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme","light");

  const dimensions=await page.evaluate(()=>({
    scrollWidth:document.documentElement.scrollWidth,
    clientWidth:document.documentElement.clientWidth
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth+1);
});

test("existing investor can resume without rebuilding transaction history",async({page},testInfo)=>{
  const user=await createVerifiedUser(testInfo,"resume");
  await login(page,user);

  await page.getByRole("link",{name:"Start my first strategy"}).click();
  await page.getByRole("button",{name:/Continue/}).click();
  await page.getByRole("button",{name:/Already following it/}).click();
  await expect(page.getByText(/will not need to recreate every old transaction/i)).toBeVisible();
  await page.getByRole("button",{name:/Continue/}).click();

  await page.getByLabel("What should we call it?").fill("Existing 9Sig");
  await page.getByLabel(/Rough account value/).fill("31816");
  await page.getByRole("button",{name:/Resume my strategy/}).click();

  await page.waitForURL(/\/app\/strategies\//);
  await expect(page.getByRole("heading",{name:"Tell us what you own today."})).toBeVisible();
  await expect(page.getByText(/do not need to rebuild your old transaction history/i)).toBeVisible();
});

test("Pro user can link another account without complicating the main flow",async({page},testInfo)=>{
  const user=await createVerifiedUser(testInfo,"multi-account","pro");
  await login(page,user);

  await page.getByRole("link",{name:"Start my first strategy"}).click();
  await page.getByRole("button",{name:/Continue/}).click();
  await page.getByRole("button",{name:/Continue/}).click();
  await page.getByLabel("What should we call it?").fill("Multi account 9Sig");
  await page.getByLabel("How much are you starting with?").fill("10000");
  await page.getByRole("button",{name:/Start my strategy/}).click();
  await page.waitForURL(/\/app\/strategies\//);

  await page.locator("summary").filter({hasText:"Strategy settings & rules"}).click();
  await expect(page.getByText("Your strategy account")).toBeVisible();
  await page.getByText("Add another account").click();
  await page.getByLabel("Account name").fill("Pension account");
  await page.getByLabel("Account type").selectOption("SIPP");
  await page.getByLabel("Broker (optional)").fill("Example Broker");
  await page.getByRole("button",{name:"Add linked account"}).click();

  await expect(page.getByText("Pension account")).toBeVisible();

  await page.locator("summary").filter({hasText:"Update portfolio"}).click();
  await expect(page.getByLabel("Account").first()).toBeVisible();
});

test("authenticated shell remains keyboard and reduced-motion friendly",async({page},testInfo)=>{
  const user=await createVerifiedUser(testInfo,"accessibility");
  await page.emulateMedia({reducedMotion:"reduce"});
  await login(page,user);

  const themeButton=page.getByRole("button",{name:"Toggle light or dark theme"});
  await themeButton.focus();
  await expect(themeButton).toBeFocused();
  const focusStyle=await themeButton.evaluate((element)=>{
    const style=getComputedStyle(element);
    return {outlineStyle:style.outlineStyle,outlineWidth:style.outlineWidth,transitionDuration:style.transitionDuration};
  });
  expect(focusStyle.outlineStyle).not.toBe("none");
  expect(focusStyle.outlineWidth).not.toBe("0px");

  const unnamedButtons=await page.locator("button").evaluateAll((buttons)=>buttons.filter((button)=>{
    const label=button.getAttribute("aria-label")||button.textContent?.trim();
    return !label;
  }).length);
  expect(unnamedButtons).toBe(0);

  const viewport=page.viewportSize();
  if(viewport&&viewport.width<=680){
    const targets=await page.locator(".nav-link,.theme-toggle,.app-topbar .button").evaluateAll((elements)=>
      elements.map((element)=>Math.round(element.getBoundingClientRect().height))
    );
    expect(targets.every((height)=>height>=44)).toBe(true);
  }
});

