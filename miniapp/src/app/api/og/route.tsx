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
          backgroundColor: "#0a0a0a",
          padding: "60px",
          fontFamily: "monospace",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ color: "#ffffff", fontSize: "48px", fontWeight: "bold" }}>
              Based Intern
            </div>
            <div style={{ color: "#888888", fontSize: "20px", marginTop: "8px" }}>
              Autonomous AI Agent on Base
            </div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              backgroundColor: status === "LIVE" ? "#00ff8815" : "#ff000015",
              border: `1px solid ${status === "LIVE" ? "#00ff8850" : "#ff000050"}`,
              borderRadius: "9999px",
              padding: "8px 20px",
            }}
          >
            <div
              style={{
                width: "12px",
                height: "12px",
                borderRadius: "50%",
                backgroundColor: status === "LIVE" ? "#00ff88" : "#ff0000",
              }}
            />
            <div
              style={{
                color: status === "LIVE" ? "#00ff88" : "#ff0000",
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
              backgroundColor: "#111111",
              border: "1px solid #222222",
              borderRadius: "16px",
              padding: "30px",
              flex: "1",
            }}
          >
            <div style={{ color: "#888888", fontSize: "16px", textTransform: "uppercase", letterSpacing: "2px" }}>
              $INTERN Price
            </div>
            <div style={{ color: "#00ff88", fontSize: "42px", fontWeight: "bold", marginTop: "8px" }}>
              {price}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              backgroundColor: "#111111",
              border: "1px solid #222222",
              borderRadius: "16px",
              padding: "30px",
              flex: "1",
            }}
          >
            <div style={{ color: "#888888", fontSize: "16px", textTransform: "uppercase", letterSpacing: "2px" }}>
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
            backgroundColor: "#111111",
            border: "1px solid #00ff8830",
            borderRadius: "16px",
            padding: "20px 30px",
          }}
        >
          <div style={{ color: "#cccccc", fontSize: "18px" }}>
            {action.slice(0, 80)}
          </div>
          <div style={{ color: "#00ff88", fontSize: "16px", fontWeight: "bold" }}>
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
