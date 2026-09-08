import { eveChannel } from "eve/channels/eve";
import { localDev, none, vercelOidc } from "eve/channels/auth";

export default eveChannel({
  auth: [
    vercelOidc(),
    localDev(),
    // Public demo of synthetic seed data only. Do not use none() on a live desk.
    none(),
  ],
});
