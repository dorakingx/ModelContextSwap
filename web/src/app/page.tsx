import { useState } from "react";

export default function Home() {
  const [amountIn, setAmountIn] = useState("");
  const [reserveIn, setReserveIn] = useState("");
  const [reserveOut, setReserveOut] = useState("");
  const [feeBps, setFeeBps] = useState("30");
  const [quote, setQuote] = useState<string | null>(null);
  const [swapParams, setSwapParams] = useState<any>({});
  const [instruction, setInstruction] = useState<any>(null);
  const MCP_SERVER = process.env.NEXT_PUBLIC_MCP_SERVER_URL ?? "http://localhost:8080";

  // クォート取得
  const getQuote = async (e: any) => {
    e.preventDefault();
    setQuote(null);
    setInstruction(null);
    try {
      const res = await fetch(`${MCP_SERVER}/get_dex_quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountIn, reserveIn, reserveOut, feeBps }),
      });
      const json = await res.json();
      setQuote(json.amountOut);
      setSwapParams({ amountIn, reserveIn, reserveOut, feeBps, amountOut: json.amountOut });
    } catch (err) {
      setQuote("Error" + String(err));
    }
  };

  // Swap命令構築例 （パラメータは利用者責任でセット）
  const buildIx = async (e: any) => {
    e.preventDefault();
    setInstruction(null);
    // UI上にstring変数で必要Inputを追加してください。
    const params: any = {
      programId: swapParams.programId || "", // 例: "..."
      pool: swapParams.pool || "",           // 例: "..."
      user: swapParams.user || "",           // 例: "..."
      userSource: swapParams.userSource || "",
      userDestination: swapParams.userDestination || "",
      vaultA: swapParams.vaultA || "",
      vaultB: swapParams.vaultB || "",
      tokenProgram: swapParams.tokenProgram || "",
      amountIn: swapParams.amountIn,
      minAmountOut: swapParams.amountOut,
    };
    try {
      const res = await fetch(`${MCP_SERVER}/build_solana_swap_instruction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      const json = await res.json();
      setInstruction(json);
    } catch (err) {
      setInstruction("Error: " + String(err));
    }
  };

  return (
    <div style={{ maxWidth: 600, margin: "2rem auto", fontFamily: "sans-serif" }}>
      <h1>Simplified DEX Quote &amp; Swap UI</h1>
      <form onSubmit={getQuote} style={{ margin: "2rem 0", padding: 12, border: "1px solid #ddd", borderRadius: 8 }}>
        <h2>Get Constant Product Quote</h2>
        <input placeholder="amountIn" value={amountIn} onChange={e => setAmountIn(e.target.value)} required />
        <input placeholder="reserveIn" value={reserveIn} onChange={e => setReserveIn(e.target.value)} required />
        <input placeholder="reserveOut" value={reserveOut} onChange={e => setReserveOut(e.target.value)} required />
        <input placeholder="feeBps (例:30)" value={feeBps} onChange={e => setFeeBps(e.target.value)} required />
        <button type="submit">Get Quote</button>
      </form>
      {quote && <div><strong>amountOut:</strong> {quote}</div>}
      <hr />
      <form onSubmit={buildIx} style={{ margin: "2rem 0", padding: 12, border: "1px solid #ccc", borderRadius: 8 }}>
        <h2>Build Solana Swap Instruction</h2>
        {/* 必要に応じてswapParams（publicKey等）をsetしてください。*/}
        <div style={{color:'gray',fontSize:'0.95em',marginBottom:6}}>
          PublicKey, Pool, Vault などは直接state書き換え or 入力欄追加で指定ください
        </div>
        <button type="submit">Build Instruction (要パラメータ補完)</button>
      </form>
      {instruction && (
        <div style={{background:'#f5f5f5',padding:12,borderRadius:6,wordBreak:'break-all'}}>
          <pre>{JSON.stringify(instruction,null,2)}</pre>
        </div>
      )}
      <div style={{marginTop:32,color:"#aaa"}}>
        Powered by MCP Server &amp; dex-ai-sdk on Next.js
      </div>
    </div>
  );
}
