export function assertTrustedRequestOrigin(input:{
  origin:string|null;
  secFetchSite:string|null;
  configuredUrl:string|undefined;
  production:boolean;
}){
  if(!input.configuredUrl){
    if(input.production)throw new Error("APP_ORIGIN_NOT_CONFIGURED");
    return;
  }

  let expected:string;
  try{
    expected=new URL(input.configuredUrl).origin;
  }catch{
    throw new Error("APP_ORIGIN_NOT_CONFIGURED");
  }

  if(input.origin){
    let actual:string;
    try{actual=new URL(input.origin).origin;}catch{throw new Error("INVALID_ORIGIN");}
    if(actual!==expected)throw new Error("INVALID_ORIGIN");
    return;
  }

  if(input.secFetchSite&&input.secFetchSite!=="same-origin"&&input.secFetchSite!=="none"){
    throw new Error("INVALID_ORIGIN");
  }
  if(input.production)throw new Error("INVALID_ORIGIN");
}
