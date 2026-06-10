import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";

/** Password auth, no email verification (personal app). */
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password],
});
