export default function AppLoading(){
  return <div className="loading-shell" aria-label="Loading your portfolio" aria-busy="true">
    <div className="skeleton skeleton-kicker"/>
    <div className="skeleton skeleton-title"/>
    <div className="skeleton skeleton-copy"/>
    <div className="loading-hero">
      <div className="skeleton skeleton-value"/>
      <div className="skeleton skeleton-action"/>
    </div>
    <div className="loading-strip">{[0,1,2].map((item)=><div className="skeleton" key={item}/>)}</div>
    <span className="sr-only">Loading your portfolio…</span>
  </div>;
}
