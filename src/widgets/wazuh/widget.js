import proxyHandler from "./proxy";

const widget = {
  proxyHandler,
  mappings: { summary: { endpoint: "agents/summary/status" } },
};

export default widget;
