import { describe,expect,it } from "vitest";
import { assertTrustedRequestOrigin } from "../src/domain/request-origin";

describe("request origin validation",()=>{
  it("accepts the configured same origin",()=>{
    expect(()=>assertTrustedRequestOrigin({
      origin:"https://app.example.com",
      secFetchSite:"same-origin",
      configuredUrl:"https://app.example.com",
      production:true
    })).not.toThrow();
  });

  it("rejects cross-origin writes",()=>{
    expect(()=>assertTrustedRequestOrigin({
      origin:"https://evil.example",
      secFetchSite:"cross-site",
      configuredUrl:"https://app.example.com",
      production:true
    })).toThrow("INVALID_ORIGIN");
  });

  it("fails closed in production when app origin configuration is missing",()=>{
    expect(()=>assertTrustedRequestOrigin({
      origin:null,
      secFetchSite:null,
      configuredUrl:undefined,
      production:true
    })).toThrow("APP_ORIGIN_NOT_CONFIGURED");
  });

  it("allows missing origin configuration only outside production",()=>{
    expect(()=>assertTrustedRequestOrigin({
      origin:null,
      secFetchSite:null,
      configuredUrl:undefined,
      production:false
    })).not.toThrow();
  });
});
