$(function () {

    var datumTemplate = Handlebars.compile($("#datum-template").html().trim());
    var typeaheadTemplate = Handlebars.compile($("#typeahead-template").html());
    var detailsTemplate = Handlebars.compile($("#details-template").html());
    var sr = /^Station(\d+)$/;
    var stations = {};


    function parseTimestamp(timestamp, timeZone) {
        var timeZones = {
            'E': 'America/New_York',
            'C': 'America/Chicago',
            'M': 'America/Denver',
            'P': 'America/Los_Angeles'
        };

        var formats = ["MM/DD/YYYY hh:mm:ss A", "MM/DD/YYYY HH:mm:ss"];

        return moment.tz(timestamp, formats, timeZones[timeZone]);
    };

    function makeDatum(feature) {
        datum = {};
        datum.geoJson = feature.geometry;
        datum.properties = feature.properties;
        processDatumDetails(datum);

        datum.tokens = [].concat(datum.properties.RouteName.split(' '),
            datum.properties.TrainNum,
            datum.properties.Aliases.split(','),
            datum.properties.stationCodes);
        datum.value = datumTemplate(datum.properties);

        return datum;
    }

    function processDatumDetails(datum) {
        var d = datum.properties;

        if (d.EventCode && d.EventDT && d.EventTZ) {
            d.hasEvent = true;
            d.EventTimestamp = parseTimestamp(d.EventDT, d.EventTZ);
            d.EventTimestampRel = d.EventTimestamp.fromNow();
        } else {
            d.hasEvent = false;
        }

        d.OriginTimestamp = parseTimestamp(d.OrigSchDep, d.OriginTZ);
        d.OriginDate = d.OriginTimestamp.date();
        d.LastUpdate = parseTimestamp(d.LastValTS, d.EventTZ || d.OriginTZ);
        d.LastUpdateRel = d.LastUpdate.fromNow();

        if (d.StatusMsg) {
            d.StatusMsg = d.StatusMsg.trim();
        }

        if (d.Velocity) {
            d.Velocity = Math.round(d.Velocity);
        }

        d.stateActive = (d.TrainState == "Active");

        d.stations = [];
        d.stationCodes = [];

        $.each(d, function (key, value) {
            r = sr.exec(key);
            if (r) {
                var s = $.parseJSON(value);
                s.eventStation = (d.hasEvent && s.code == d.EventCode);
                s.cmnt = s.postcmnt || s.estarrcmnt || s.estdepcmnt || s.schcmnt;

                d.stationCodes.push(s.code);
                d.stations[r[1] - 1] = s;
            }
        });
    }


    function parseStationTimes(properties) {
        if (!properties.stationTimesParsed) {
            $.each(properties.stations, function (index, value) {
                var s = value;
                var times = ['scharr', 'schdep', 'postarr', 'postdep', 'estarr', 'estdep'];

                $.each(times, function (index, value) {
                    if (s[value]) {
                        s[value] = parseTimestamp(s[value], s.tz);
                        //s[value + "Rel"] = s[value].fromNow();
                        s[value + "Abs"] = s[value].format("LT z");
                    }
                });
            });
            properties.stationTimesParsed = true;
        }
    }

    function processStationCodes(node) {
        $("span.stationCode", node).each(function (index, element) {
            var stationCodeElement = $(this);
            var stationCode = stationCodeElement.text();
            if (stations[stationCode]) {
                var stationName = stations[stationCode].StationName;
                stationCodeElement.tooltip({
                    title: stationName,
                    placement: 'auto'
                });
            }
        });
    }

    $.get("https://docs.google.com/spreadsheet/pub?key=0AvrkbWHnoksNdEZtb3RhRDZ2MU5qVl8yUC1vTGdOc1E&single=true&gid=3&range=A1%3AB974&output=csv", function (data, textStatus, jqXHR) {
        $.each($.parse(data, {}).results.rows,
            function (index, value) {
                stations[value.Code] = value;
            });
    });

    $("#searchbox").typeahead([{
        name: "Trains",
        prefetch: {
            url: "https://www.googleapis.com/mapsengine/v1/tables/01382379791355219452-08584582962951999356/features?version=published&key=AIzaSyCzkHf7juAK8qsQhp7Uj06yZC2F-9Dki2w&maxResults=250",
            ttl: 30,
            filter: function (parsedResponse) {
                return $.map(parsedResponse.features, makeDatum);
            }
        },
        limit: 20,
        template: function (value) {
            return typeaheadTemplate(value.properties);
        }
    }]).on("typeahead:selected", function (obj, datum) {
        parseStationTimes(datum.properties);
        $("#details").html(detailsTemplate(datum.properties));
        processStationCodes($('#details'));
        if ($("#navbar-collapse").height() > 50) {
            $("#navbar-collapse").collapse("hide");
        };
    }).on("typeahead:initialized ", function () {
        $(".tt-dropdown-menu").css("max-height", 300);
    });
});