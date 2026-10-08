# Shot Ledger

Independent local engineering sample by Xiaolong Pan. Python standard library only; no model calls, paid services, customer data or API credentials.

## Run

Requires Python 3.10 or later. From this folder:

```sh
python -m unittest -v
python server.py
```

Open http://127.0.0.1:8846/ and click **Run all four checks**. The service binds to loopback only. Stop with Ctrl+C. Its local SQLite database is created automatically and retained between runs. Use `python server.py --port 8850 --database another-local.sqlite` for a separate demonstration.

## What this demonstrates

Each event has a job id, event id and attempt number. A SQLite transaction stores the decision together with the state change. Exact duplicate deliveries replay their first decision; a conflicting reuse returns HTTP 409. Late events from an older attempt cannot replace a newer result. Successful, failed and cancelled attempts remain terminal until a permitted explicit retry; only failed/cancelled attempts can retry. Concurrent retry requests naming the old attempt increment the attempt number once. The maximum attempt is 1,000,000 and cannot overflow through retry.

The interface runs four deterministic sequences against the actual local HTTP service: success before running, duplicate success, cancelled work receiving late success, and an old result arriving after a successful retry. **Reload saved job** reads the SQLite record again. The displayed mock result labels are not generated images or video.

## Verification

19 Python tests pass, including all six orderings of running/two-success notifications, 16 concurrent duplicate events, 16 concurrent retry commands, conflicting event ids, input validation and HTTP restart/replay. Chinese and emoji results survive persistence and HTTP round trips; unpaired Unicode surrogates and excessively nested JSON return readable 400 errors without changing the job. The HTTP tests launch an ephemeral loopback server and temporary database, shut it down, restart against the same file and verify the recorded result/decision. Chrome previously ran all four visible scenarios through HTTP; the input-validation updates were verified by the automated HTTP tests. These tests cover synthetic examples, not a provider integration or load benchmark.

## Scope limits

This is a local state-handling example, not a production job queue. It has no authentication, provider integration, worker execution, real billing, media storage, distributed deployment or automatic event retention. A cancelled ledger state does not stop or refund a provider's work. HTTP responses include the full event history for inspectability; production pagination and retention are outside this small sample. Callers must retain stable event ids and attach the correct attempt. SQLite protects local transactional state; it does not make external effects exactly-once. Clock timestamps are informational, not ordering authority. AI-assisted implementation; no claim of professional human review.
