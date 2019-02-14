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

# Filter for a new tag
action "tag" {
  needs = "test"
  uses = "actions/bin/filter@master"
  args = "tag"
}

action "publish" {
  needs = "tag"
  uses = "actions/npm@master"
  args = "publish --access public"
  secrets = ["NPM_TOKEN"]
}
