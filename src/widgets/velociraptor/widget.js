import proxyHandler from "./proxy";

const widget = {
  proxyHandler,
  mappings: { summary: { endpoint: "clients" } },
};

export default widget;
