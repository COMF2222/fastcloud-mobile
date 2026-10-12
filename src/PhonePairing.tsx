import { useEffect, useState } from "react";
import { native } from "./native";
import { boot } from "./state";
import { Sheet, useText } from "./ui";

export function PhonePairing({
  code,
  expiresIn,
  onClose,
}: {
  code: string;
  expiresIn: number;
  onClose: () => void;
}) {
  const t = useText();
  const [error, setError] = useState("");
  const [seconds, setSeconds] = useState(expiresIn);
  useEffect(() => {
    let alive = true,
      busy = false;
    const deadline = Date.now() + expiresIn * 1000;
    const poll = async () => {
      if (busy || document.hidden || !alive) return;
      busy = true;
      try {
        const result = await native.pairingPoll();
        if (alive && result.ready) {
          onClose();
          await boot();
        } else if (alive) setError("");
      } catch (cause) {
        if (alive)
          setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        busy = false;
      }
    };
    const timer = setInterval(() => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setSeconds(left);
      if (left > 0) void poll();
    }, 3000);
    void poll();
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [code, expiresIn, onClose]);
  return (
    <Sheet title={t("Подключить с ПК", "Connect with PC")} onClose={onClose}>
      <p>
        {t(
          "На компьютере открой Veirune → Настройки → Аккаунт → Подключить телефон и введи этот код.",
          "On your PC, open Veirune → Settings → Account → Connect your phone and enter this code.",
        )}
      </p>
      <strong className="pairing-code">{code}</strong>
      <p>
        {t(
          "Подтверди вход в браузере на ПК. Телефон подключится автоматически.",
          "Confirm sign-in in your PC browser. Your phone will connect automatically.",
        )}
      </p>
      <small role="status">
        {seconds > 0
          ? `${t("Код действует ещё", "Code expires in")} ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
          : t(
              "Код истёк. Закрой окно и получи новый.",
              "Code expired. Close this window and request a new one.",
            )}
      </small>
      {error && <p className="error">{error}</p>}
    </Sheet>
  );
}
