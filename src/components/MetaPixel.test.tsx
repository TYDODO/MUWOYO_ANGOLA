import { StrictMode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import MetaPixel from "@/components/MetaPixel";
import {
  isCommercialContentPath,
  isMetaPixelPageViewAllowed,
  openMetaPixelPreferences,
  setMetaPixelConsent,
  trackMetaEvent,
} from "@/lib/meta-pixel";

function TestRoutes() {
  const navigate = useNavigate();
  return (
    <>
      <button type="button" onClick={() => navigate("/dashboard")}>Dashboard</button>
      <MetaPixel />
    </>
  );
}

describe("Meta Pixel", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.getElementById("muwoyo-meta-pixel-script")?.remove();
    delete window.fbq;
    delete window._fbq;
    delete window.__muwoyoMetaPixelInitialized;
  });

  it("does not initialize or queue events before consent", () => {
    expect(trackMetaEvent("Contact")).toBe(false);
    expect(window.fbq).toBeUndefined();
    expect(document.getElementById("muwoyo-meta-pixel-script")).toBeNull();
  });

  it("initializes once and queues the provided events", () => {
    setMetaPixelConsent("accepted");

    expect(trackMetaEvent("Contact")).toBe(true);
    expect(trackMetaEvent("CompleteRegistration")).toBe(true);
    expect(trackMetaEvent("StartTrial")).toBe(true);
    expect(document.querySelectorAll("#muwoyo-meta-pixel-script")).toHaveLength(1);
    expect(window.fbq?.queue.filter(([command]) => command === "init")).toHaveLength(1);
    expect(window.fbq?.queue.filter(([command, event]) => command === "track" && ["Contact", "CompleteRegistration", "StartTrial"].includes(String(event)))).toHaveLength(3);
  });

  it("stops tracking after consent is withdrawn", () => {
    setMetaPixelConsent("accepted");
    expect(trackMetaEvent("Contact")).toBe(true);

    setMetaPixelConsent("rejected");
    expect(trackMetaEvent("Contact")).toBe(false);
    expect(window.fbq?.queue.filter(([command, event]) => command === "track" && event === "Contact")).toHaveLength(1);
  });

  it("tracks the initial route once and one PageView for each route change", async () => {
    setMetaPixelConsent("accepted");
    render(
      <StrictMode>
        <MemoryRouter initialEntries={["/"]}>
          <TestRoutes />
        </MemoryRouter>
      </StrictMode>,
    );

    await waitFor(() => {
      expect(window.fbq?.queue.filter(([command, event]) => command === "track" && event === "PageView")).toHaveLength(1);
    });
    expect(window.fbq?.queue.filter(([command, event]) => command === "track" && event === "ViewContent")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Dashboard" }));
    await waitFor(() => {
      expect(window.fbq?.queue.filter(([command, event]) => command === "track" && event === "PageView")).toHaveLength(2);
    });
    expect(window.fbq?.queue.filter(([command, event]) => command === "track" && event === "ViewContent")).toHaveLength(1);
  });

  it("waits for explicit consent before loading the script", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <TestRoutes />
      </MemoryRouter>,
    );

    expect(document.getElementById("muwoyo-meta-pixel-script")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Aceitar cookies de marketing" }));

    await waitFor(() => {
      expect(document.getElementById("muwoyo-meta-pixel-script")).not.toBeNull();
    });
    expect(window.fbq?.queue.filter(([command, event]) => command === "track" && event === "PageView")).toHaveLength(1);
  });

  it("persists accept and reject choices and allows reopening preferences", async () => {
    const firstVisit = render(
      <MemoryRouter initialEntries={["/"]}>
        <TestRoutes />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Aceitar cookies de marketing" }));
    await waitFor(() => {
      expect(window.localStorage.getItem("muwoyo:meta-pixel-consent")).toBe("accepted");
    });
    firstVisit.unmount();

    const laterVisit = render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <TestRoutes />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("complementary", { name: "Preferências de cookies" })).toBeNull();

    act(() => openMetaPixelPreferences());
    expect(await screen.findByRole("complementary", { name: "Preferências de cookies" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Recusar" }));
    expect(window.localStorage.getItem("muwoyo:meta-pixel-consent")).toBe("rejected");
    expect(trackMetaEvent("Contact")).toBe(false);
    laterVisit.unmount();

    render(
      <MemoryRouter initialEntries={["/"]}>
        <TestRoutes />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("complementary", { name: "Preferências de cookies" })).toBeNull();
    expect(trackMetaEvent("Contact")).toBe(false);
  });

  it("limits ViewContent to the marketing home page and skips credential-bearing URLs", () => {
    expect(isCommercialContentPath("/")).toBe(true);
    expect(isCommercialContentPath("/dashboard")).toBe(false);
    expect(isMetaPixelPageViewAllowed("?ref=campaign", "")).toBe(true);
    expect(isMetaPixelPageViewAllowed("?access_token=secret", "")).toBe(false);
    expect(isMetaPixelPageViewAllowed("", "#code=secret")).toBe(false);
  });
});
