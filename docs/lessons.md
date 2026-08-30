# Lessons

Mistakes already paid for once. Newest first.

---

## A concurrency test with no concurrency in it

**What happened.** The test guarding against two administrators approving one
deposit simultaneously fired both requests from the shared `admin` fixture.
Playwright serialises requests issued through a single `APIRequestContext`, so
the second only began after the first had committed — and was correctly refused.

The test passed. It also passed against a build with the row lock deliberately
removed, where the deposit really was credited twice.

**Why it matters.** A test named for a race that does not create one is worse
than no test: it is a standing claim that the race is handled.

**The rule.** A test written to catch a specific defect is not finished until it
has been *seen to fail* in that defect's presence. Break the fix, watch it go
red, put the fix back. For concurrency specifically: separate clients, or it is
not concurrent.

**Related:** [`bugs/001-double-credit-on-concurrent-approval.md`](bugs/001-double-credit-on-concurrent-approval.md).

---

## Unique-looking test data that was not unique across workers

**What happened.** The player factory built usernames from a timestamp and a
module-level counter. Playwright runs several worker *processes*, each with its
own counter starting at one, so two workers entering the same millisecond
produced the same username. Whichever registration lost got a `409`, and the
fixture failed before the test body ran.

The symptom was two unrelated tests failing in the full run and passing on every
serial re-run — the shape of flake, which is the shape that gets a retry added
instead of a fix.

**Why it matters.** "Unique" has to mean unique across the concurrency the suite
actually runs at. A counter is per-process; a timestamp has millisecond
resolution; neither is a guarantee, and together they are still not one.

**The rule.** Generated identifiers include a random component. Before calling a
failure flake, check whether it reproduces serially — if it only fails in
parallel, it is a real bug about shared state, not noise.

---

## A negative test passed because the feature was broken for everyone

**What happened.** The authentication hook was registered with
`app.register(authPlugin)`. Fastify encapsulates plugins, so a hook added inside
one applies to that plugin and its children — never to sibling route modules
registered on the root instance. The hook ran for nothing.

Every protected route still answered `401`, because `request.principal` was
undefined for every caller. The security test asserting that an anonymous caller
cannot read a profile passed, and it passed for the wrong reason: the endpoint
was not rejecting anonymous callers, it was rejecting everyone.

It surfaced only when the first *positive* test arrived — a real session getting
a `401` on its own profile.

**Why it matters.** A negative test alone cannot tell "correctly refuses" from
"refuses everything". It confirms the door is locked without ever checking that
the key works.

**The rule.** Every authorisation rule gets a pair: someone who may, and someone
who may not. A `403`/`401` test with no positive counterpart is not evidence.

**Also:** register cross-cutting hooks on the root instance, or wrap them with
`fastify-plugin`. `app.register` is encapsulation, not just registration.
