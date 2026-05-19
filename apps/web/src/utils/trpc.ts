import type { AppRouter } from "@access-control-system/api/routers/index";
import { env } from "@access-control-system/env/web";
import { QueryCache, QueryClient } from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { toast } from "@access-control-system/ui/components/sonner";

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      toast.error(error.message, {
        actionProps: {
          children: "retry",
          onPress: () => {
            query.invalidate();
          },
        },
      });
    },
  }),
});

const serverURL =
  typeof window === "undefined"
    ? (process.env.INTERNAL_SERVER_URL ?? env.NEXT_PUBLIC_SERVER_URL)
    : env.NEXT_PUBLIC_SERVER_URL;

const trpcClient = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${serverURL}/trpc`,
      fetch(url, options) {
        return fetch(url, {
          ...options,
          credentials: "include",
        });
      },
    }),
  ],
});

export const trpc = createTRPCOptionsProxy<AppRouter>({
  client: trpcClient,
  queryClient,
});
