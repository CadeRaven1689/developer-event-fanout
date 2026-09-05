export {};

const response = await fetch("http://localhost:3000/developer-events", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    event_id: "build-api-7f31-failed",
    event: {
      kind: "build.completed",
      project: "public-api",
      status: "failed",
      commit: "7f31cafe",
    },
    subscribers: [
      { subscriber_id: "dev-alex", topics: ["builds", "diagnostics"] },
      { subscriber_id: "dev-sam", topics: ["releases"] },
      { subscriber_id: "dev-alex", topics: ["builds"] },
      { subscriber_id: "dev-rin", topics: ["builds", "releases"] },
    ],
  }),
});

console.log(await response.text());
