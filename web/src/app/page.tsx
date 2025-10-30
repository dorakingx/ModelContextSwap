import { useState, useCallback } from "react";
// import { useWallet } from '@solana/wallet-adapter-react'; (Uncomment when wallet adapter is installed)

function useDexApi() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quote, setQuote] = useState<string | null>(null);
  const [instruction, setInstruction] = useState<any>(null);

  const getQuote = useCallback(async (amountIn: string, reserveIn: string, reserveOut: string, feeBps: string) => {
    setLoading(true); setError(null); setInstruction(null); setQuote(null);
    try {
      const res = await fetch(`/api/get_dex_quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountIn, reserveIn, reserveOut, feeBps }),
      });
      const json = await res.json();
      setQuote(json.amountOut);
    } catch (err) {
      setError("Error fetching quote: " + String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const buildIx = useCallback(async (params: any) => {
    setLoading(true); setError(null); setInstruction(null);
    try {
      const res = await fetch(`/api/build_solana_swap_instruction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      const json = await res.json();
      setInstruction(json);
    } catch (err) {
      setError("Error building instruction: " + String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  return { getQuote, buildIx, loading, error, quote, instruction };
}

export default function Home() {
  const [amountIn, setAmountIn] = useState("");
  const [reserveIn, setReserveIn] = useState("");
  const [reserveOut, setReserveOut] = useState("");
  const [feeBps, setFeeBps] = useState("30");
  const [swapParams, setSwapParams] = useState<any>({});
  // const { publicKey } = useWallet(); // Uncomment to connect wallet

  const { getQuote, buildIx, loading, error, quote, instruction } = useDexApi();

  return (
    <div style={{ maxWidth: 600, margin: "2rem auto", fontFamily: "sans-serif" }}>
      <h1>Simplified DEX Quote &amp; Swap UI</h1>
      <form onSubmit={e => {e.preventDefault(); getQuote(amountIn, reserveIn, reserveOut, feeBps); setSwapParams({ amountIn, reserveIn, reserveOut, feeBps })}} style={{ margin: "2rem 0", padding: 12, border: "1px solid #ddd", borderRadius: 8 }}>
        <h2>Get Constant Product Quote</h2>
        <input placeholder="amountIn" value={amountIn} onChange={e => setAmountIn(e.target.value)} required />
        <input placeholder="reserveIn" value={reserveIn} onChange={e => setReserveIn(e.target.value)} required />
        <input placeholder="reserveOut" value={reserveOut} onChange={e => setReserveOut(e.target.value)} required />
        <input placeholder="feeBps (例:30)" value={feeBps} onChange={e => setFeeBps(e.target.value)} required />
        <button type="submit" disabled={loading}>Get Quote</button>
      </form>
      {loading && <div>Loading...</div>}
      {error && <div style={{color: 'red'}}>{error}</div>}
      {quote && <div><strong>amountOut:</strong> {quote}</div>}
      <hr />
      <form onSubmit={e => {e.preventDefault(); buildIx(swapParams);}} style={{ margin: "2rem 0", padding: 12, border: "1px solid #ccc", borderRadius: 8 }}>
        <h2>Build Solana Swap Instruction</h2>
        {/* Future: Wallet integration goes here (see useWallet above) */}
        <div style={{color:'gray',fontSize:'0.95em',marginBottom:6}}>
          PublicKey, Pool, Vault etc. should be set via wallet/context or additional UI
        </div>
        <button type="submit" disabled={loading}>Build Instruction (add params)</button>
      </form>
      {instruction && (
        <div style={{background:'#f5f5f5',padding:12,borderRadius:6,wordBreak:'break-all'}}>
          <pre>{JSON.stringify(instruction,null,2)}</pre>
        </div>
      )}
      <div style={{marginTop:32,color:"#aaa"}}>
        Powered by MCP Server &amp; dex-ai-sdk on Next.js<br/>
        <span style={{fontSize:'0.9em'}}>Wallet integration: see @solana/wallet-adapter-react &amp; useWallet</span>
      </div>
    </div>
  );
}
