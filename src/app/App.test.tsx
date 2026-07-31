import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { App } from "./App";

describe("App", () => {
  test("renders the Config Forge application title", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { name: "Config Forge" }),
    ).toBeInTheDocument();
  });
});
