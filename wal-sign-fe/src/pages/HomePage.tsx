import { Link } from 'react-router-dom';
import { ConnectWallet } from '../components/ConnectWallet';

export function HomePage() {
  return (
    <div className="space-y-24">

      {/* ======================= HERO ======================= */}
      <section className="text-center py-20 px-6 relative">

        {/* Neon background glow circles */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-20 left-1/4 w-72 h-72 bg-purple-800/40 rounded-full blur-[120px] animate-pulse-slow"></div>
          <div className="absolute bottom-10 right-1/4 w-80 h-80 bg-purple-700/40 rounded-full blur-[150px] animate-pulse-slower"></div>
        </div>

        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-white drop-shadow-[0_0_25px_rgba(109,40,217,0.7)] leading-tight">
          Secure Document Signing  
        </h1>

        <p className="max-w-3xl mx-auto text-lg text-purple-200/90 mt-6 leading-relaxed">
        Sign, seal, and store your documents with cryptographic security powered by Sui, Walrus, and Seal.
        </p>

        <div className="flex justify-center gap-6 mt-10 flex-wrap">
          <Link
            to="/upload"
            className="px-10 py-4 text-lg font-semibold rounded-xl bg-gradient-to-r from-purple-700 to-purple-800 text-white shadow-[0_0_20px_rgba(109,40,217,0.5)] hover:shadow-[0_0_30px_rgba(109,40,217,0.7)] hover:scale-105 transition-all"
          >
            Upload Document →
          </Link>

          <Link
            to="/verify"
            className="px-10 py-4 text-lg font-semibold rounded-xl border border-purple-500/40 bg-white/5 text-purple-200 hover:bg-white/10 hover:border-purple-400/60 backdrop-blur-md transition-all hover:scale-105"
          >
            Verify Document
          </Link>
        </div>
      </section>

      {/* ======================= FEATURES ======================= */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 px-4">
        {[
          {
            emoji: '🔐',
            title: 'Encrypted with Seal',
            desc: 'Your documents are sealed using cutting-edge encryption.',
          },
          {
            emoji: '🌐',
            title: 'Stored on Walrus',
            desc: 'Decentralized storage ensures your files are censorship-proof and always accessible.',
          },
          {
            emoji: '⛓️',
            title: 'Verified on Sui',
            desc: 'Every signature is immutably logged on-chain.',
          },
          {
            emoji: '🚀',
            title: 'Sign in Seconds',
            desc: 'Just connect your wallet, upload, and sign—no accounts or intermediaries required.',
          },
        ].map((f, i) => (
          <div
            key={i}
            className="p-6 rounded-2xl bg-gradient-to-br from-purple-800/60 to-purple-700/40 border border-purple-600/40 shadow-[0_0_25px_rgba(109,40,217,0.4)] hover:shadow-[0_0_35px_rgba(109,40,217,0.7)] backdrop-blur-xl transition-all hover:scale-[1.03]"
          >
            <div className="text-4xl mb-4 drop-shadow-[0_0_12px_rgba(255,255,255,0.4)]">{f.emoji}</div>
            <h3 className="text-xl font-bold text-purple-200 mb-2">{f.title}</h3>
            <p className="text-purple-200 text-sm">{f.desc}</p>
          </div>
        ))}
      </section>

      {/* ======================= STEPS ======================= */}
      <section className="space-y-16 px-6">

        <h2 className="text-center text-4xl font-extrabold text-white mb-6 drop-shadow-[0_0_20px_rgba(109,40,217,0.8)]">
          How It Works
        </h2>

        {[
          {
            step: 'STEP 1',
            shortDesc: 'Connect Your Wallet',
            fullDesc: 'Sign in with your Sui wallet to access the platform. Your wallet connection is secure and encrypted.',
            gradient: 'from-cyan-400/60 to-blue-400/60',
            icon: '🔐',
            stepColor: 'text-cyan-100',
            iconGradient: 'from-cyan-300/30 to-blue-300/30',
            iconBorder: 'border-cyan-200/40',
          },
          {
            step: 'STEP 2',
            shortDesc: 'Upload & Encrypt',
            fullDesc: 'Upload your PDF and add the wallet addresses of those who need to sign. WalSign automatically encrypts your document using Seal encryption and stores it on Walrus decentralized storage. Only authorized signers can access it.',
            gradient: 'from-pink-400/60 to-rose-400/60',
            icon: '📄',
            stepColor: 'text-pink-100',
            iconGradient: 'from-pink-300/30 to-rose-300/30',
            iconBorder: 'border-pink-200/40',
          },
          {
            step: 'STEP 3',
            shortDesc: 'Sign & Record',
            fullDesc: 'Signers receive the document, review it in their dashboard, and sign using their wallet. The signed document is re-encrypted and stored on Walrus.',
            gradient: 'from-teal-400/60 to-emerald-400/60',
            icon: '💼',
            stepColor: 'text-teal-100',
            iconGradient: 'from-teal-300/30 to-emerald-300/30',
            iconBorder: 'border-teal-200/40',
          },
          {
            step: 'STEP 4',
            shortDesc: 'Verify Signatures',
            fullDesc: 'Check document authenticity anytime by verifying signatures on-chain. ',
            gradient: 'from-teal-400/60 to-emerald-400/6',
            icon: '✅',
            stepColor: 'text-teal-100',
            iconGradient: 'from-teal-300/30 to-emerald-300/30',
            iconBorder: 'border-teal-200/40',
          }
        ].map((s, i) => (
          <div
            key={i}
            className={`flex flex-col md:flex-row rounded-3xl overflow-hidden bg-gradient-to-br ${s.gradient} border border-white/20 shadow-lg hover:shadow-xl transition-shadow`}
          >
            {/* Left: Step Number, Short Description, Icon */}
            <div className="flex-1 p-10 text-white backdrop-blur-sm flex flex-col items-center md:items-start justify-center">
              <div className={`text-sm tracking-widest ${s.stepColor} mb-4`}>
                {s.step}
              </div>
              <h3 className="text-2xl font-bold mb-4 text-center md:text-left text-white">
                {s.shortDesc}
              </h3>
              <div className={`w-24 h-24 rounded-full bg-gradient-to-br ${s.iconGradient} flex items-center justify-center text-5xl border-2 ${s.iconBorder} shadow-lg`}>
                {s.icon}
              </div>
            </div>

            {/* Right: Full Explanation */}
            <div className="flex-1 bg-white/5 backdrop-blur-xl p-10 flex items-center">
              <p className="text-white/95 text-lg leading-relaxed">
                {s.fullDesc}
              </p>
            </div>
          </div>
        ))}
      </section>

      {/* ======================= CTA ======================= */}
      <section className="px-6 py-16 text-center bg-gradient-to-br from-purple-800/60 to-purple-700/60 rounded-3xl shadow-[0_0_30px_rgba(109,40,217,0.5)] backdrop-blur-xl border border-purple-600/40">
        <h2 className="text-4xl font-bold text-purple-200 drop-shadow-[0_0_20px_rgba(255,255,255,0.4)]">
          Ready to Experience Web3 Signing?
        </h2>
        <p className="text-purple-200 max-w-2xl mx-auto mt-4">
          Upload your document today and start signing.
        </p>
        <Link to="/upload">
          <button className="mt-8 px-14 py-5 text-xl font-semibold rounded-xl bg-gradient-to-r from-purple-700 to-purple-600 text-white shadow-[0_0_30px_rgba(109,40,217,0.7)] hover:shadow-[0_0_40px_rgba(109,40,217,0.9)] hover:scale-110 transition-all">
            Start Now →
          </button>
        </Link>
      </section>
    </div>
  );
}