import { requireUser } from "@/lib/session";
import { sql } from "@/lib/db";

export async function GET(){
  try{
    const user=await requireUser();
    const strategyInstances=await sql.unsafe(
      "SELECT * FROM strategy_instances WHERE user_id=$1 ORDER BY created_at",
      [user.id]
    );
    const ids=strategyInstances.map((row:any)=>row.id);

    const [
      accounts,
      subscription,
      ledger,
      actions,
      reconciliations,
      overrides,
      versionMigrations,
      performance,
      notifications,
      endpoints,
      audits
    ]=await Promise.all([
      sql.unsafe("SELECT id,name,wrapper,country,currency,broker_name,created_at,updated_at FROM accounts WHERE user_id=$1 ORDER BY created_at",[user.id]),
      sql.unsafe("SELECT s.status,s.cadence,s.current_period_end,s.cancel_at_period_end,s.billing_grace_until,p.slug AS plan_slug,p.display_name AS plan_name FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE s.user_id=$1 LIMIT 1",[user.id]),
      ids.length?sql.unsafe("SELECT * FROM ledger_events WHERE strategy_instance_id=ANY($1::uuid[]) ORDER BY occurred_at,created_at",[ids]):Promise.resolve([]),
      ids.length?sql.unsafe("SELECT * FROM actions WHERE strategy_instance_id=ANY($1::uuid[]) ORDER BY created_at",[ids]):Promise.resolve([]),
      ids.length?sql.unsafe("SELECT * FROM reconciliations WHERE strategy_instance_id=ANY($1::uuid[]) ORDER BY occurred_at",[ids]):Promise.resolve([]),
      ids.length?sql.unsafe("SELECT * FROM overrides WHERE strategy_instance_id=ANY($1::uuid[]) ORDER BY created_at",[ids]):Promise.resolve([]),
      ids.length?sql.unsafe("SELECT * FROM strategy_version_migrations WHERE strategy_instance_id=ANY($1::uuid[]) ORDER BY migrated_at",[ids]):Promise.resolve([]),
      ids.length?sql.unsafe("SELECT * FROM performance_series WHERE strategy_instance_id=ANY($1::uuid[]) ORDER BY date,series_type",[ids]):Promise.resolve([]),
      sql.unsafe("SELECT id,action_id,type,title,body,read_at,created_at FROM notifications WHERE user_id=$1 ORDER BY created_at",[user.id]),
      sql.unsafe("SELECT channel,enabled,created_at,updated_at FROM notification_endpoints WHERE user_id=$1 ORDER BY channel",[user.id]),
      sql.unsafe(
        "SELECT action,entity_type,entity_id,metadata,occurred_at FROM audit_events WHERE actor_user_id=$1 OR entity_id=ANY($2::text[]) ORDER BY occurred_at",
        [user.id,ids.map(String)]
      )
    ]);

    return Response.json({
      exportedAt:new Date().toISOString(),
      user:{
        email:user.email,
        country:user.country,
        baseCurrency:user.baseCurrency,
        timezone:user.timezone,
        anonymousAggregateOptIn:user.anonymousAggregateOptIn
      },
      subscription:subscription[0]??null,
      accounts,
      strategyInstances,
      ledger,
      actions,
      reconciliations,
      overrides,
      strategyVersionMigrations:versionMigrations,
      performanceSeries:performance,
      notifications,
      notificationEndpoints:endpoints,
      auditEvents:audits
    },{
      headers:{
        "Content-Disposition":'attachment; filename="strategyos-data-export.json"',
        "Cache-Control":"no-store"
      }
    });
  }catch{
    return Response.json({error:"Could not export account."},{status:500});
  }
}
