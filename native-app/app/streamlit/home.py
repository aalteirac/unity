import streamlit as st
from snowflake.snowpark.context import get_active_session

st.title("Unity Analytics (dummy)")
st.caption("Placeholder app delivered through the Unity onboarding portal.")

session = get_active_session()
metrics = session.sql("SELECT metric, value FROM core.sample_metrics").collect()
for column, row in zip(st.columns(len(metrics)), metrics):
    column.metric(row["METRIC"], row["VALUE"])

st.info("Your Unity dataset is delivered separately as a private data listing.")
