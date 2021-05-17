
```
mcm <cmd> [args]

Commands:
  mcm cloud:gen-css                         Generate css for chrome extension to publically publish  [aliases: cg]
  mcm env:backup [pid:env...]               Backup env(s)  [aliases: eb]
  mcm env:check-app-version [pid:env...]    Check the app version of env(s)  [aliases: ea]
  mcm env:check-web-status [pid:env...]     Check the web status of env(s)  [aliases: ew]
  mcm env:delete [pid:env...]               Delete environment(s)
  mcm env:deploy [sh|tar] [pid:env...]      Redeploy or deploy env(s) using the optional provided tar file or shell script
  mcm env:exec <file> [pid:env...]          Execute a file in env(s)  [aliases: ee]
  mcm env:get <remote-path> [pid:env...]    Get a remote path (file or directory) in env(s)  [aliases: eg]
  mcm env:put <local-path> [pid:env...]     Put a local path (file or directory) file in env(s) /tmp dir  [aliases: ep]
  mcm env:set-ip-access [pid:env...]        (Re)set IP access to default for env(s)  [aliases: ei]
  mcm env:smoke-test [pid:env...]           Run smoke tests in env(s)  [aliases: es]
  mcm env:sync [pid:env...]                 Sync code with parent. N/A for master envs.
  mcm host:env-match                        Match envs to hosts based on shared system attributes  [aliases: he]
  mcm host:update [pid:env...]              Gather performance metrics of hosts via env(s)  [aliases: hu]
  mcm project:grant-gitlab [pid:env...]     Grant access to proj(s) to all configured gitlab projects in .secrets.json  [aliases: pg]
  mcm project:update [pid...]               Update projects' info, users, and envs  [aliases: pu]
  mcm user:add <email> <role> [pid...]      Add user with email and role to projects  [aliases: ua]
  mcm user:delete <email> [pid...]          Delete user with email from projects  [aliases: ud]
  mcm variable:get <name> [pid...]          Get var on projects' envs  [aliases: vg]
  mcm variable:set <name> <value> [pid...]  Set var to value on projects' envs  [aliases: vs]

Options:     ** Commands may have additional options. See <cmd> -h. **
  -v, --verbose  Display debugging information  [boolean]
  -q, --quiet    Suppress normal output. Only display errors.  [boolean]
  -h, --help     Show help  [boolean]
```