# CalVer Suffix Input Design

## Goal

Allow the `calver_date` input to create either the existing canonical daily tag or an explicit same-day tag with a short suffix, while rejecting impossible dates.

## Accepted Input

`calver_date` accepts one of these forms:

- `YYYY.MM.DD`
- `YYYY.MM.DD-[A-Za-z0-9]{1,32}`

The date portion must be a real UTC calendar date. Invalid dates such as `2026.02.30` and `2026.13.01` are rejected. Empty input still means "use the current UTC date".

## Tag Behavior

`buildCalverTag` prefixes the accepted input with `v`, so `2026.04.19-rc1` becomes `v2026.04.19-rc1`.

`isCanonicalCalverTag` continues to return true only for `vYYYY.MM.DD`. Suffix tags are valid action targets, but they are not canonical comparison tags for finding the latest scheduled CalVer tag.

## Implementation Scope

Update `src/domain/calver.ts` so validation parses the date part separately from the optional suffix. Keep input trimming in `src/action/inputs.ts` unchanged.

Update documentation in `README.md` and `action.yml` to describe the optional alphanumeric suffix and the 32-character suffix limit.

## Testing

Extend `test/calver-tag.test.ts` to cover:

- canonical dates remain accepted
- suffix inputs like `2026.04.19-rc1` are accepted and tagged
- suffix length is limited to 32 characters
- empty suffix, non-alphanumeric suffix characters, malformed dates, and impossible calendar dates are rejected
