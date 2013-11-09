console.log 'Initializing Qucik GitHub Info'

repos   = []
baseUrl = "api.github.com/repos"

class GitHubRepo
  constructor: ($dom) ->
    @element = $dom

  repoUrl: =>
    @element.attr("href").replace /github.com/, baseUrl

  appendGitHubInfo: ->
    $.get @repoUrl(), (data) =>
      infoString = " . #{data.language}-Stars: #{data.stargazers_count}, Forks: #{data.forks_count}"
      @element.append infoString
      #console.log data.name
      #console.log data.forks_count
      #console.log data.stargazers_count
      #console.log data.subscribers_count
      #console.log data.language

main = ->

  $(".g").each ->
    $title = $(@).find("a:first")
    if $title.html().indexOf("GitHub") >= 0
      repos.push(new GitHubRepo($title))

  for result in repos
    result.appendGitHubInfo()

main()

document.addEventListener "DOMSubtreeModified", ->
  console.log "ajax!"
