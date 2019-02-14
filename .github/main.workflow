workflow "build, test and publish" {
  on = "push"
  resolves = ["publish"]
}

action "build" {
  uses = "actions/npm@master"
  args = "ci"
  secrets = ["NPM_TOKEN"]
}

action "test" {
  needs = "build"
  uses = "actions/npm@master"
  args = "t"
  secrets = ["NPM_TOKEN"]
}

action "publish" {
  needs = "test"
  uses = "actions/npm@master"
  args = "publish --access public"
  secrets = ["NPM_TOKEN"]
}
