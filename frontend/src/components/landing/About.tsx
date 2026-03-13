import { motion } from "framer-motion";

export default function About() {
  return (
    <section className="border-t border-border py-24">
      <div className="mx-auto max-w-3xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
        >
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo">
            About the project
          </p>
          <h2 className="mt-3 font-display text-3xl tracking-tight text-ink">
            Civic data infrastructure for local democracy
          </h2>

          <div className="mt-8 space-y-4 text-[15px] leading-relaxed text-ink-muted">
            <p>
              <strong className="font-semibold text-ink">GramSAMBANDH</strong>{" "}
              — System for Analysing Meetings and Budgets for Accountable
              Neighbourhood Development & Hyperlocal Governance — is an
              AI-powered civic data platform that connects local government
              records to make democratic decision-making visible and
              understandable.
            </p>
            <p>
              The system uses AI-driven document extraction, classification, and
              retrieval to convert millions of public records from Kerala's
              Sulekha project management system into structured, searchable data.
              It links deliberation with outcomes, enabling citizens to track how
              public decisions are made and funds are spent.
            </p>
            <p>
              Built as public-interest research infrastructure, GramSAMBANDH
              aims to strengthen democratic transparency by making government
              records genuinely accessible to citizens, journalists, and civil
              society.
            </p>
          </div>

          <div className="mt-10 flex gap-8 border-t border-border pt-8">
            <div>
              <p className="font-mono text-xs uppercase tracking-wider text-ink-faint">
                Built by
              </p>
              <p className="mt-1 text-sm font-medium text-ink">
                Abishek Choutagunta
              </p>
              <p className="text-xs text-ink-muted">
                Economist & Governance Researcher
              </p>
            </div>
            <div>
              <p className="font-mono text-xs uppercase tracking-wider text-ink-faint">
                &nbsp;
              </p>
              <p className="mt-1 text-sm font-medium text-ink">
                Tushar Anand
              </p>
              <p className="text-xs text-ink-muted">
                AI Engineer & NLP Researcher
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
