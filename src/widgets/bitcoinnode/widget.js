import bitcoinNodeProxyHandler from "./proxy";

const widget = {
  api: "{url}",
  proxyHandler: bitcoinNodeProxyHandler,
  mappings: { info: { endpoint: "info" } },
};

export default widget;
