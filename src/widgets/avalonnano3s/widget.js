import avalonNano3sProxyHandler from "./proxy";

const widget = {
  proxyHandler: avalonNano3sProxyHandler,
  mappings: {
    info: { endpoint: "info" },
  },
};

export default widget;
