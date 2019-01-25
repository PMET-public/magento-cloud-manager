
```
mcm <cmd> [args]

Commands:
  mcm env:backup [pid:env...]               Backup env(s)                                                                      [aliases: eb]
  mcm env:check-public-url [pid:env...]     Check the public url of env(s) for expected app response                           [aliases: ec]
  mcm env:delete [pid:env...]               Delete environment(s)
  mcm env:deploy [tar] [pid:env...]         Redeploy or deploy env(s) using the optional provided tar file as the new git head
  mcm env:exec <file> [pid:env...]          Execute a file in env(s)                                                           [aliases: ee]
  mcm env:get <remote-path> [pid:env...]    Get a remote path (file or directory) in env(s)                                    [aliases: eg]
  mcm env:put <local-path> [pid:env...]     Put a local path (file or directory) file in env(s) /tmp dir                       [aliases: ep]
  mcm env:smoke-test [pid:env...]           Run smoke tests in env(s)                                                          [aliases: es]
  mcm host:env-match                        Match envs to hosts based on shared system attributes                              [aliases: he]
  mcm host:update [pid:env...]              Gather performance metrics of hosts via env(s)                                     [aliases: hu]
  mcm project:find-failures [pid:env...]    Query activity API by proj(s) to find envs that failed to deploy                   [aliases: pf]
  mcm project:grant-gitlab [pid:env...]     Grant access to proj(s) to all configured gitlab projects in .secrets.json         [aliases: pg]
  mcm project:update [pid...]               Update projects' info, users, and envs                                             [aliases: pu]
  mcm user:add <email> <role> [pid...]      Add user with email and role to projects                                           [aliases: ua]
  mcm user:delete <email> [pid...]          Delete user with email from projects                                               [aliases: ud]
  mcm variable:get <name> [pid...]          Get var on projects' envs                                                          [aliases: vg]
  mcm variable:set <name> <value> [pid...]  Set var to value on projects' envs                                                 [aliases: vs]

Options:     ** Commands may have additional options. See <cmd> -h. **
  -v, --verbose  Display debugging information                                                                                     [boolean]
  -q, --quiet    Suppress normal output. Only display errors.                                                                      [boolean]
  -h, --help     Show help                                                                                                         [boolean]
```