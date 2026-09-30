// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import SettingsPreview, { getServerSideProps } from "pages/preview/settings";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("next/head", () => ({ default: ({ children }) => children }));
afterEach(() => vi.unstubAllEnvs());
describe("local design preview route", () => {
  it.each(["production", "test"])("is unavailable in %s", (mode) => {
    vi.stubEnv("NODE_ENV", mode);
    expect(getServerSideProps()).toEqual({ notFound: true });
  });
  it("serves development fixtures without a live API", async () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(getServerSideProps()).toEqual({ props: {} });
    render(<SettingsPreview />);
    expect(await screen.findByLabelText("Dashboard title")).toHaveValue("Gather");
    expect(screen.getByText("Local design preview")).toBeInTheDocument();
  });
});
