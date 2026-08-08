"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import styles from "./connect.module.css";

type SessionState = { sessionId: string; status: string; qrCode: string | null };

export default function WowPartyConnectPage() {
  const [session, setSession] = useState<SessionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/wowparty/whatsapp", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Starea nu a putut fi citită.");
      setSession(data);
      setError("");
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(refresh, 3000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const start = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/wowparty/whatsapp", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "QR-ul nu a putut fi generat.");
      setSession(data);
      await refresh();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const connected = session?.status === "CONNECTED";

  return <main className={styles.page}>
    <section className={styles.card}>
      <Link className={styles.back} href="/wowparty">← Înapoi în SuperParty</Link>
      <p className={styles.eyebrow}>CONTROL GM · CONEXIUNE PROTEJATĂ</p>
      <h1 className={styles.title}>Conectează WhatsApp WowParty</h1>
      <p className={styles.copy}>Codul este afișat numai conturilor GM. Numărul și cheia motorului nu sunt expuse în interfață.</p>
      <div className={styles.state}>
        <span>STARE SESIUNE</span>
        <strong className={connected ? styles.connected : styles.offline}>{loading ? "SE VERIFICĂ…" : session?.status || "NECUNOSCUTĂ"}</strong>
      </div>
      {error && <p className={styles.error}>{error}</p>}
      {connected ? <div className={styles.ok}>WhatsApp este conectat. Inboxul și agentul AI pot primi mesaje noi.</div> : <>
        <button className={styles.button} disabled={loading} onClick={start}>{loading ? "Se pregătește…" : "Generează un QR nou"}</button>
        {session?.qrCode && <div className={styles.qrWrap}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.qr} src={session.qrCode} alt="Cod QR WhatsApp WowParty" />
          <p className={styles.hint}>În telefon: WhatsApp → Dispozitive asociate → Asociază un dispozitiv. Pagina verifică automat conectarea.</p>
        </div>}
      </>}
    </section>
  </main>;
}
