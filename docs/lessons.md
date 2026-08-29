# Lessons

Mistakes already paid for once. Newest first.

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
