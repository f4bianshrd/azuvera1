import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  // One client per request: a module-level QueryClient leaks cached data between SSR requests.
  // networkMode "always": eigene Daten kommen offline aus dem Gerätespeicher.
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { networkMode: "always", retry: (count) => count < 1 && typeof navigator !== "undefined" && navigator.onLine },
      mutations: { networkMode: "always" },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Lets Query own freshness; set caching defaults on the QueryClient, not the router.
    defaultPreloadStaleTime: 0,
  });

  return router;
};
