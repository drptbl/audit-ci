workflow "build, test and publish" {
  on = "push"
  resolves = ["publish"]
}

action "build" {
  uses = "actions/npm@master"
  args = "ci"
}

action "test" {
  needs = "build"
  uses = "actions/npm@master"
  args = "t"
}

action "publish" {
  needs = "test"
  uses = "actions/npm@master"
  args = "publish --access public"
  secrets = ["NPM_TOKEN"]
}
