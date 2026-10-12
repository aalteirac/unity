# Dummy Native App + test data share

Provider fixtures for testing the portal flow end to end in `SFSENORTHAMERICA.COLLEGE_APP_AALTEIRAC`. Object names match `.env.example`.

## Created in Snowflake

| Object | Purpose |
| --- | --- |
| `UNITY_DATA.PUBLIC.EVENTS` | 8 fake rows across the three demo Unity IDs, plus an `INTERNAL_NOTE` column that is never shared |
| `UNITY_DATA.PORTAL_SHARING.EVENTS_UNITY_DEMO_ORBIT` | Secure view filtered to `unity_demo_orbit` (3 rows) |
| Share `UNITY_PORTAL_DATA_ORBIT` | Grants only that view; no recipients yet |
| `UNITY_ANALYTICS_PACKAGE` | Native App package, `DISTRIBUTION = EXTERNAL`, version `V1` patch 0, security review APPROVED, DEFAULT release directive set |
| `UNITY_ANALYTICS_APP_TEST` | Local test install of the app |

The app (`app/`) has an `app_user` role, `core.hello()`, a `core.sample_metrics` view and a Streamlit page. It does not read the Unity dataset.

## Reproduce

```sh
snow sql -c MainAnthonyAccount --role ACCOUNTADMIN --warehouse DEMO_WH -f provider-setup.sql
# from app/: PUT manifest.yml, setup.sql, README.md to @UNITY_ANALYTICS_PACKAGE.STAGE_CONTENT.APP_CODE/
#            PUT streamlit/home.py to .../APP_CODE/streamlit/ (AUTO_COMPRESS=FALSE)
```

```sql
ALTER APPLICATION PACKAGE UNITY_ANALYTICS_PACKAGE REGISTER VERSION V1 USING '@UNITY_ANALYTICS_PACKAGE.STAGE_CONTENT.APP_CODE';
ALTER APPLICATION PACKAGE UNITY_ANALYTICS_PACKAGE MODIFY RELEASE CHANNEL DEFAULT ADD VERSION V1;
-- wait until SHOW VERSIONS shows review_status = APPROVED (a few minutes)
ALTER APPLICATION PACKAGE UNITY_ANALYTICS_PACKAGE MODIFY RELEASE CHANNEL DEFAULT SET DEFAULT RELEASE DIRECTIVE VERSION = V1 PATCH = 0;
CREATE APPLICATION UNITY_ANALYTICS_APP_TEST FROM APPLICATION PACKAGE UNITY_ANALYTICS_PACKAGE USING VERSION V1;
```

## Not done yet: private listings

Both listings need a real consumer account (`ORG.ACCOUNT`) other than this one. The portal's adapters generate them, or by hand:

```sql
CREATE EXTERNAL LISTING UNITY_ANALYTICS_APP_LISTING APPLICATION PACKAGE UNITY_ANALYTICS_PACKAGE AS $$
title: "Unity Analytics (dummy)"
subtitle: "Test app"
description: "Dummy Native App for portal testing"
listing_terms: { type: "OFFLINE" }
targets: { accounts: ["<ORG>.<ACCOUNT>"] }
$$ PUBLISH=FALSE REVIEW=FALSE;

CREATE EXTERNAL LISTING UNITY_DATA_ORBIT_LISTING SHARE UNITY_PORTAL_DATA_ORBIT AS $$
title: "Unity data - Orbit Interactive"
subtitle: "Test data"
description: "Fake Unity events filtered to unity_demo_orbit"
listing_terms: { type: "OFFLINE" }
targets: { accounts: ["<ORG>.<ACCOUNT>"] }
$$ PUBLISH=FALSE REVIEW=FALSE;
```

Publish with `ALTER LISTING <name> PUBLISH`.

## Clean up

```sql
DROP APPLICATION UNITY_ANALYTICS_APP_TEST;
DROP APPLICATION PACKAGE UNITY_ANALYTICS_PACKAGE;
DROP SHARE UNITY_PORTAL_DATA_ORBIT;
DROP DATABASE UNITY_DATA;
```
