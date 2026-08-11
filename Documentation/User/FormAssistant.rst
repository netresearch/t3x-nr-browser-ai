.. include:: /Includes.rst.txt

.. _user-form-assistant:

==============
Form assistant
==============

The second plugin turns a sentence into a filled form and a real result. A
visitor writes what they want, the on-device model derives the parameters, and
the form is filled with them and run.

It exists because a parameter-rich form is where an assistant earns its keep.
Nobody struggles to read a page; plenty of people give up on a query form with
thirty controls because they cannot tell which of them expresses what they
want. Whether it worked is also plain to see: either the form holds the
parameters the sentence asked for, or it does not.

.. _user-form-assistant-chain:

What happens when you ask
=========================

#. The request goes to Chrome's on-device model, together with the JSON Schema
   of the form. The schema is a constraint, not a suggestion: the model answers
   with JSON that fits it — one set of arguments per query the request implies,
   so a comparison between two places is two sets.
#. Those arguments are checked against the schema again. A value outside a
   field's option set, or a field the form does not have, stops the call and
   nothing is changed.
#. The values are written into the visible controls. This is the step that
   makes the derivation inspectable — what the model understood is on screen,
   in the same controls anyone would use by hand.
#. The form is read back in full and run, once per set of arguments. The model
   sets only what the request mentioned; everything else comes from the form's
   own current state.
#. The result is rendered as tables and returned to whoever made the call.
#. Finally the model is asked, this time unconstrained, what those results mean
   for the question. That sentence appears directly under the request, and the
   form collapses so the answer sits next to the question rather than below
   seventy controls. The form stays one keystroke away, because correcting a
   derived value is the other half of the point.

Nothing is submitted to a server on the way. The query goes from the browser
straight to the open data source, and the model never leaves the device.

.. _user-form-assistant-using:

Using it
========

Write the request in ordinary words. The demonstration form queries weather, so
a request may name a place, a period and what you actually care about:

..  code-block:: text

    Will the weekend in Leipzig be any good for a barbecue?

The form fills in with a place, a number of forecast days and the daily
variables that answer the question — a maximum temperature, a precipitation
total, a wind speed. Everything the request did not mention keeps its default.

Correct anything that is wrong and press the form's own submit button to run it
again. That path needs no model at all, which is also why the form stays fully
usable in a browser that has none.

.. _user-form-assistant-limits:

What it cannot do
=================

The prose is a summary, not the result. It is written by a small on-device
model from the query result and capped in length, and the tables below it are
what the data source actually returned — read those when a number matters. A
phrasing call that fails leaves the tables in place and says nothing rather
than guessing.

One request runs at most four queries. Beyond that a request has stopped being
a question and become a report, and every query costs the visitor a round trip
to the data source.

A place is resolved to coordinates by the data source's own search, and the
first match wins. The resolved name is shown with the result, so a wrong match
is visible rather than silent — add a country if the place name is ambiguous.

Without JavaScript the form renders and validates but cannot run: the query is
made from the browser, and there is no server-side counterpart for it.

.. _user-form-assistant-agents:

Being called by an agent
========================

The same tool is registered with the browser's model context where the browser
has one. An agent outside the page then sees the identical name, description
and schema, calls it the same way, and receives the same result as text.

It receives the result, not the prose. Phrasing happens on the page's own path
only: an agent has its own voice and its own reason for asking, and handing it
a sentence written for this page would override both.

The tool's description is deliberately not translated with the rest of the
form. A tool's identity should not change with the language of the page, or an
agent would discover a different contract per language. The controls a visitor
reads are translated; the contract an agent reads is not.

Turn on :confval:`form-assistant-showconfiguration` to see all of it on the
page: the tool's name, its description, the schema and the arguments of the
last call.
