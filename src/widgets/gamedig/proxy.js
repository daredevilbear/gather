import { GameDig } from "gamedig";

import getServiceWidget from "utils/config/service-helpers";
import createLogger from "utils/logger";

const proxyName = "gamedigProxyHandler";
const logger = createLogger(proxyName);

export default async function gamedigProxyHandler(req, res) {
  const { group, service, index } = req.query;
  const serviceWidget = await getServiceWidget(group, service, index);
  const url = new URL(serviceWidget.url);

  try {
    // Keep incoming headers out of GameDig options. Its HTTP caching must remain
    // disabled while GHSA-ch52-4w7c-c8xp is unpatched; see SECURITY.md.
    const gamedigOptions = {
      type: serviceWidget.serverType,
      host: url.hostname,
      port: url.port,
      givenPortOnly: true,
      checkOldIDs: true,
    };

    if (serviceWidget.gameToken) {
      gamedigOptions.token = serviceWidget.gameToken;
    }

    const serverData = await GameDig.query(gamedigOptions);

    res.status(200).send({
      online: true,
      name: serverData.name,
      map: serverData.map,
      players: serverData.numplayers ?? serverData.players?.length,
      maxplayers: serverData.maxplayers,
      bots: serverData.bots.length,
      ping: serverData.ping,
    });
  } catch (e) {
    if (e) logger.error(e);

    res.status(200).send({
      online: false,
    });
  }
}
