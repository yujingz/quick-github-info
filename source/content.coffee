console.log 'Initializing Qucik GitHub Info'

repos        = []
baseUrl      = "api.github.com/repos"

class GitHubRepo
  constructor: ($dom) ->
    @element = $dom

  repoUrl: =>
    @element.attr("href").replace /github.com/, baseUrl

  appendGitHubInfo: ->
    $.ajax
      type: "GET",
      url: @repoUrl(),
      beforeSend: (xhr) ->
        xhr.setRequestHeader "Authorization", "Basic ${AUTH_TOKEN}"
      success: (data) =>
        infoString = " | #{data.language} - S: #{data.stargazers_count}, F: #{data.forks_count}"
        @element.append infoString

main = ->

  repos = []

  $(".g").each ->
    $title = $(@).find("a:first")
    if $title.html().indexOf("GitHub") >= 0
      repos.push(new GitHubRepo($title))

  for result in repos
    result.appendGitHubInfo()

main()
