console.log 'Initializing Qucik GitHub Info'

githubResults = []
repos         = []

cleanUp = (input) ->
  input = input.replace /<em>/, ""
  input = input.replace /<\/em>/, ""
  input.split(" ")[0]

class Repo
  initialize: (repo)->
    console.log repo

$(".g").each ->
  title = $(@).find("a:first").html()
  if title.indexOf("GitHub") >= 0
    githubResults.push(cleanUp(title))

for result in githubResults
  info = result.split("/")
  repos.push
    author: info[0]
    repoName: info[1]

