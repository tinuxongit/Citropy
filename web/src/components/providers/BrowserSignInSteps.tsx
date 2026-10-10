import { useState } from "react";
import { Loader } from "../Loader.tsx";

export function BrowserSignInSteps({ url, busy, disabled, onFinish }: { url: string; busy: boolean; disabled: boolean; onFinish: (address: string) => Promise<boolean> }) {
  const [address, setAddress] = useState("");
  return (
    <form className="browser-sign-in" onSubmit={event => { event.preventDefault(); void onFinish(address.trim()).then(done => { if (done) setAddress(""); }); }}>
      <p className="provider-maintenance-note">Open the sign-in page and approve access. When Citropy runs on this computer, it finishes by itself. When it runs on another computer, paste the address your browser ends on.</p>
      <a className="btn" data-variant="primary" href={url} target="_blank" rel="noreferrer noopener">Open Google sign-in</a>
      <label className="feature-field">Address from your browser
        <input value={address} spellCheck={false} autoComplete="off" placeholder="http://127.0.0.1:…" onChange={event => setAddress(event.target.value)} />
      </label>
      <button className="btn" disabled={disabled || busy || !address.trim()}>{busy && <Loader size={14} />}Finish sign-in</button>
    </form>
  );
}
