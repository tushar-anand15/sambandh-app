/**
 * The internal metrics page.
 *
 * Not a public page and not linked from the tab bar. Everything else on this
 * site answers without an account because the records are public; this counts
 * people rather than panchayats, so it needs a token and states that it does.
 *
 * The numbers here come from the application's own tables, not from the
 * analytics service — no client-side tool knows what a sign-up is. What Umami
 * sees (routes, bodies, downloads) and what this page sees (accounts, questions,
 * refusals) are deliberately separate, and neither carries anything about a
 * person: this page shows aggregates only, because the endpoint returns nothing
 * else.
 */

import AssistantHealthPanel from "@/components/metrics/AssistantHealthPanel";
import SignupWeeks from "@/components/metrics/SignupWeeks";
import { useMetrics } from "@/components/metrics/useMetrics";

export default function MetricsSection() {
  const { data, loading, error } = useMetrics();

  return (
    <div className="shell-container section-page">
      <h1>Metrics</h1>
      <p className="lede">
        Accounts, questions and assistant scoping, counted from this project's own
        tables. Route and download use is measured separately, and neither record
        holds anything identifying a reader.
      </p>

      {loading ? (
        <p className="selector-status" aria-busy="true">
          Loading the metrics…
        </p>
      ) : null}

      {error ? (
        <p className="notice" role="alert">
          {error}
        </p>
      ) : null}

      {data ? (
        <div className="flex flex-col gap-s7">
          <section aria-labelledby="totals-heading">
            <h2 id="totals-heading">Totals</h2>
            <dl data-testid="metrics-totals">
              <dt className="label">Accounts</dt>
              <dd>{data.users_total}</dd>

              <dt className="label">
                Sign-ups in the last {data.weeks} weeks
              </dt>
              <dd>{data.signups_total}</dd>

              <dt className="label">Questions asked</dt>
              <dd>{data.questions_asked}</dd>

              <dt className="label">Saved chats</dt>
              <dd>{data.saved_chats}</dd>

              <dt className="label">Returning readers</dt>
              <dd>{data.returning_users}</dd>
            </dl>
            <p className="source-line">
              A returning reader is one who asked something on more than one day.
            </p>
          </section>

          <SignupWeeks weeks={data.signups_per_week} />
          <AssistantHealthPanel health={data.assistant} />
        </div>
      ) : null}
    </div>
  );
}
