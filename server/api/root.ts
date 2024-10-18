import { createCallerFactory, createTRPCRouter } from "@/server/api/trpc";
import { outboundRouter } from "./routers/outbound";

export const appRouter = createTRPCRouter({
  outbound: outboundRouter,
});

export const createCaller = createCallerFactory(appRouter);

export type AppRouter = typeof appRouter;
