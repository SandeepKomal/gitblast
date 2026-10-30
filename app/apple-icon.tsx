import { ImageResponse } from "next/og";
import { markDataUri } from "@/components/Logo";

// The home-screen icon: the mark on a dark tile. iOS rounds the corners itself.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(160deg, #2c2c2e, #000000)",
        }}
      >
        <img src={markDataUri()} width={124} height={124} alt="" />
      </div>
    ),
    size,
  );
}
