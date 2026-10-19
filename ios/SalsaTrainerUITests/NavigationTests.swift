import XCTest

final class NavigationTests: XCTestCase {
    func testOverviewEditorAndDiscard() {
        let app = XCUIApplication(); app.launchArguments = ["--ui-testing"]; app.launch()
        XCTAssertTrue(app.staticTexts["Salsa Figuren"].waitForExistence(timeout: 15))
        app.buttons["addFigure"].tap()
        let title = app.textFields["figureTitle"]
        XCTAssertTrue(title.waitForExistence(timeout: 10))
        XCTAssertFalse(app.buttons["saveFigure"].isEnabled)
        title.tap(); title.typeText("Sombrero")
        // A name alone cannot be saved without a confirmed video.
        XCTAssertFalse(app.buttons["saveFigure"].isEnabled)
        app.buttons["Zurück"].tap()
        XCTAssertTrue(app.buttons["Weiter bearbeiten"].waitForExistence(timeout: 5))
        app.buttons["Weiter bearbeiten"].tap()
        XCTAssertEqual(title.value as? String, "Sombrero")
        app.buttons["Zurück"].tap(); app.buttons["Änderungen verwerfen"].tap()
        XCTAssertTrue(app.staticTexts["Salsa Figuren"].waitForExistence(timeout: 5))
        let screenshot = XCTAttachment(screenshot: app.screenshot()); screenshot.lifetime = .keepAlways; add(screenshot)
    }
    func testMultiVideoPlayerAndManualOrientation() {
        let app = XCUIApplication(); app.launchArguments = ["--ui-testing", "--with-videos"]; app.launch()
        let card = app.buttons["figure-Ocho"]
        XCTAssertTrue(card.waitForExistence(timeout: 30)); card.tap()
        XCTAssertTrue(app.buttons["scaleVideo"].waitForExistence(timeout: 10))
        XCTAssertEqual(app.buttons["scaleVideo"].label, "Fit")
        app.buttons["scaleVideo"].tap(); XCTAssertEqual(app.buttons["scaleVideo"].label, "Crop")
        app.buttons["rotateVideo"].tap()
        let landscape = NSPredicate { _, _ in app.frame.width > app.frame.height }
        expectation(for: landscape, evaluatedWith: nil); waitForExpectations(timeout: 10)
        XCTAssertEqual(app.buttons["scaleVideo"].label, "Crop")
        app.buttons["videoSelector"].tap(); app.buttons["Lado"].tap()
        XCTAssertEqual(app.buttons["scaleVideo"].label, "Crop")
        app.buttons["rotateVideo"].tap()
        let portrait = NSPredicate { _, _ in app.frame.height > app.frame.width }
        expectation(for: portrait, evaluatedWith: nil); waitForExpectations(timeout: 10)
        app.buttons["Zurück"].tap()
        XCTAssertTrue(card.waitForExistence(timeout: 5))
    }

}
