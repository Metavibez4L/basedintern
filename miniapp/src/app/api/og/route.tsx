import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const price = searchParams.get("price") ?? "—";
  const tvl = searchParams.get("tvl") ?? "—";
  const status = searchParams.get("status") ?? "LIVE";
  const action = searchParams.get("action") ?? "Monitoring markets...";

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200",
          height: "630",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#050a14",
          padding: "60px",
          fontFamily: "monospace",
          backgroundImage:
            "linear-gradient(rgba(0,212,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,212,255,0.03) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ color: "#ffffff", fontSize: "48px", fontWeight: "bold" }}>
              Based Intern
            </div>
            <div style={{ color: "#6b8ab0", fontSize: "20px", marginTop: "8px" }}>
              Autonomous AI Agent on Base
            </div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              backgroundColor: status === "LIVE" ? "#00d4ff15" : "#ff000015",
              border: `1px solid ${status === "LIVE" ? "#00d4ff50" : "#ff000050"}`,
              borderRadius: "9999px",
              padding: "8px 20px",
            }}
          >
            <div
              style={{
                width: "12px",
                height: "12px",
                borderRadius: "50%",
                backgroundColor: status === "LIVE" ? "#00d4ff" : "#ff0000",
              }}
            />
            <div
              style={{
                color: status === "LIVE" ? "#00d4ff" : "#ff0000",
                fontSize: "18px",
                fontWeight: "bold",
              }}
            >
              {status}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: "flex", gap: "40px" }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              backgroundColor: "#0a1628",
              border: "1px solid #1a2a4a",
              borderRadius: "16px",
              padding: "30px",
              flex: "1",
            }}
          >
            <div style={{ color: "#6b8ab0", fontSize: "16px", textTransform: "uppercase", letterSpacing: "2px" }}>
              $INTERN Price
            </div>
            <div style={{ color: "#00d4ff", fontSize: "42px", fontWeight: "bold", marginTop: "8px" }}>
              {price}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              backgroundColor: "#0a1628",
              border: "1px solid #1a2a4a",
              borderRadius: "16px",
              padding: "30px",
              flex: "1",
            }}
          >
            <div style={{ color: "#6b8ab0", fontSize: "16px", textTransform: "uppercase", letterSpacing: "2px" }}>
              Pool TVL
            </div>
            <div style={{ color: "#ffffff", fontSize: "42px", fontWeight: "bold", marginTop: "8px" }}>
              {tvl}
            </div>
          </div>
        </div>

        {/* Latest Action */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            backgroundColor: "#0a1628",
            border: "1px solid #00d4ff30",
            borderRadius: "16px",
            padding: "20px 30px",
          }}
        >
          <div style={{ color: "#c8ddf0", fontSize: "18px" }}>
            {action.slice(0, 80)}
          </div>
          <div style={{ color: "#00d4ff", fontSize: "16px", fontWeight: "bold" }}>
            Launch to see more →
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
