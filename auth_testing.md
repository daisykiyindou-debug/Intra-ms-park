# Auth Testing Playbook Used

- Verify seeded demo credentials from `/app/memory/test_credentials.md`.
- Test login success/failure through `/api/auth/login` and the real login page.
- Test account status enforcement with the correct password: active users can login; suspended/deactivated users receive 403 with a disabled-account message.
- Test password reset invalidates the old password and allows login with the new temporary password.
- Confirm frontend stores returned `employee_id` and reloads `/api/me` using `X-Employee-Id`.

Note: this app uses MOCKED custom auth via localStorage + `X-Employee-Id`; it is not JWT/cookie auth.