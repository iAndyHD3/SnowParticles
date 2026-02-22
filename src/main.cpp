#include <Geode/Geode.hpp>
#include "Geode/binding/GJGameLevel.hpp"
#include "Geode/binding/PlayLayer.hpp"
#include "Geode/cocos/cocoa/CCObject.h"
#include "Geode/cocos/particle_nodes/CCParticleExamples.h"
#include "Geode/loader/Mod.hpp"
#include "Geode/loader/SettingV3.hpp"
#include "Geode/ui/Notification.hpp"
#include "Geode/ui/OverlayManager.hpp"


using namespace geode::prelude;

#include <Geode/modify/LevelEditorLayer.hpp>
#include <Geode/modify/MenuLayer.hpp>
#include <Geode/modify/PlayLayer.hpp>

bool currentlyPersistent = false;

CCNode* createParticleSnow() {
    return cocos2d::CCParticleSnow::createWithTotalParticles((Mod::get()->getSettingValue<int64_t>("particle-count")));
}
class $modify(MyMenuLayer, MenuLayer) {
    bool init() {
        if (!MenuLayer::init())
            return false;
        auto particle = createParticleSnow();
        particle->setTag(3314);

        if (!particle) {
            geode::Notification::create("Snow particles mod - Could not create particle!", NotificationIcon::Error);
            return true;
        }

        if (currentlyPersistent)
            return true;

        if (Mod::get()->getSettingValue<bool>("across-layers")) {
            currentlyPersistent = true;
            OverlayManager::get()->addChild(particle);
            return true;
        }

        addChild(particle);

        return true;
    }
};

CCNode* getPersistent() {
    if (!currentlyPersistent)
        return nullptr;

    for (const auto& ref : OverlayManager::get()->getChildrenExt()) {
        if (ref->getTag() == 3314)
            return ref;
    }
    return nullptr;
}

class $modify(PL, PlayLayer) {
    void hideParticle(float dt) {
        if (auto p = getPersistent()) {
            p->setVisible(false);
        }
    }
    void showParticle(float dt) {
        if (auto p = getPersistent()) {
            p->setVisible(true);
            geode::log::info("SET TRUE");
        }
    }
    bool init(GJGameLevel* level, bool a, bool b) {
        if (!PlayLayer::init(level, a, b))
            return false;

        bool pl = Mod::get()->getSettingValue<bool>("playlayer");
        if (!pl && currentlyPersistent) {
            this->scheduleOnce(schedule_selector(PL::hideParticle), 0.2f);
        } else if (pl && !currentlyPersistent) {
            addChild(createParticleSnow());
        }
        return true;
    }

    void onQuit() {
        GameManager::get()->scheduleOnce(schedule_selector(PL::showParticle), 0.2f);
        return PlayLayer::onQuit();
    }
};
