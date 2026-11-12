import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/push-config")({
  server: {
    handlers: {
      GET: async () => {
        const pub = process.env.VAPID_PUBLIC_KEY;
        const configured = !!(pub && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);
        return Response.json({ configured, publicKey: configured ? pub : null }, { headers: { "Cache-Control": "no-store" } });
      },
    },
  },
});
