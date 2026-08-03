"use client";

import { browserSessionPersistence, setPersistence, signInWithCustomToken } from "firebase/auth";
import { useEffect, useState } from "react";
import { createImpersonationFirebaseClient } from "@/lib/firebase-client";

export default function ImpersonationHandoffPage() {
  const [error, setError] = useState("");

  useEffect(() => {
    const channel = new URL(window.location.href).searchParams.get("channel") ?? "";
    if (!channel || !window.opener) {
      setError("This secure account window was not opened from Super Admin.");
      return;
    }
    let used = false;
    const receiveToken = async (event: MessageEvent) => {
      if (
        used ||
        event.origin !== window.location.origin ||
        event.source !== window.opener ||
        event.data?.type !== "dvcs-impersonation-token" ||
        event.data?.channel !== channel
      )
        return;
      used = true;
      try {
        const client = createImpersonationFirebaseClient();
        await setPersistence(client.auth, browserSessionPersistence);
        await signInWithCustomToken(client.auth, String(event.data.token));
        window.sessionStorage.setItem("dvcs.impersonationMode", "true");
        window.sessionStorage.setItem(
          "dvcs_impersonation",
          JSON.stringify({ email: event.data.email, startedAt: new Date().toISOString() }),
        );
        window.opener = null;
        window.location.replace("/dashboard");
      } catch (reason) {
        used = false;
        setError(reason instanceof Error ? reason.message : "Unable to open this account.");
      }
    };
    window.addEventListener("message", receiveToken);
    window.opener.postMessage(
      { type: "dvcs-impersonation-ready", channel },
      window.location.origin,
    );
    return () => window.removeEventListener("message", receiveToken);
  }, []);

  return (
    <main className="state-page">
      <div className="state-card">
        <div className="car-loader" aria-hidden="true" />
        <h1>{error ? "Account could not open" : "Opening secure account"}</h1>
        <p>{error || "Creating an isolated, audited session in this tab…"}</p>
        {error ? <button onClick={() => window.close()}>Close Tab</button> : null}
      </div>
    </main>
  );
}
