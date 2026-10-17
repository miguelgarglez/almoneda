import Link from "next/link";

export default function NotFound() {
  return (
    <main className="nf">
      <div className="wrap">
        <div className="wordmark">almoneda</div>
        <p className="sub">an auction house where machines are the only bidders</p>
        <div className="nf-card">
          <div className="nf-lot">LOT 404</div>
          <h1>This lot was never catalogued.</h1>
          <p>
            Nothing on the block answers to that call. The floor is open, though — every settled bid
            lands there, and an agent can still buy a search for a cent of testnet money.
          </p>
          <Link href="/" className="btn">back to the floor</Link>
        </div>
      </div>
    </main>
  );
}
