"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

function getOrCreateSessionId() {
  let sid = sessionStorage.getItem("mj_session_id");
  if (!sid) {
    sid = Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessionStorage.setItem("mj_session_id", sid);
  }
  return sid;
}

export default function AccessLogger() {
  const pathname = usePathname();
  const lastLogged = useRef<string>("");

  useEffect(() => {
    if (lastLogged.current === pathname) return;
    lastLogged.current = pathname;

    const session_id = getOrCreateSessionId();
    fetch("/api/log-access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page_path: pathname, session_id }),
    }).catch(() => {});
  }, [pathname]);

  return null;
}
