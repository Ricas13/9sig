import { describe,expect,it } from "vitest";
import { buildQuoteUrl } from "../src/lib/market-data";

describe("market data provider URL",()=>{
  it("keeps a path prefix on the configured base URL",()=>{
    expect(buildQuoteUrl("https://gateway.example.com/market/v1","/quote",{symbol:"TQQQ"}).href)
      .toBe("https://gateway.example.com/market/v1/quote?symbol=TQQQ");
  });

  it("tolerates trailing slashes on the base and a missing leading slash on the path",()=>{
    expect(buildQuoteUrl("https://api.example.com/","quote",{symbol:"A"}).href).toBe("https://api.example.com/quote?symbol=A");
    expect(buildQuoteUrl("https://api.example.com/v1///","/historical",{symbol:"A"}).pathname).toBe("/v1/historical");
  });

  it("encodes query values and keeps an existing query out of the path",()=>{
    const url=buildQuoteUrl("https://api.example.com","/historical",{symbol:"A B&C",at:"2030-01-02T03:04:05.000Z"});
    expect(url.searchParams.get("symbol")).toBe("A B&C");
    expect(url.pathname).toBe("/historical");
  });
});
