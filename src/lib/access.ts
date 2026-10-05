export function hasPaidAccess(user:{email:string;subscription_status:string}) {
  const owner=process.env.OWNER_EMAIL?.trim().toLowerCase();
  if(owner&&user.email.toLowerCase()===owner) return true;
  return ["active","trialing"].includes(user.subscription_status);
}